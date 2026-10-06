// public/js/order-confirmation.js
// Tasks 11-12: poll order status by Stripe session_id and render the result.
(function () {
  "use strict";

  var root = document.getElementById("confirmation-root");
  if (!root) return;

  var POLL_MS = 2000;
  var MAX_ATTEMPTS = 20;

  var params = new URLSearchParams(location.search);
  var sessionId = params.get("session_id");

  if (!sessionId) {
    root.textContent = "Missing order reference";
    return;
  }

  function render(html) {
    root.innerHTML = html;
  }

  function clearCart() {
    try {
      localStorage.removeItem("fnf_cart");
      localStorage.removeItem("fnf_discount");
    } catch (e) {
      /* ignore storage errors */
    }
  }

  function renderPaid(order) {
    render(
      '<h1>Thank you!</h1>' +
        "<p>Your order <strong>#" +
        order.order_id +
        "</strong> is confirmed.</p>" +
        "<p>Total paid: <strong>$" +
        order.total +
        "</strong></p>" +
        '<p><a href="/shop">Continue shopping</a></p>'
    );
  }

  function renderNotCompleted() {
    render(
      "<h1>Checkout incomplete</h1>" +
        "<p>This checkout didn't complete — your cart is still saved.</p>" +
        '<p><a href="/cart">Return to cart</a></p>'
    );
  }

  function renderStillProcessing() {
    render(
      "<h1>Almost there</h1>" +
        "<p>Payment is still processing — we'll email your confirmation.</p>"
    );
  }

  var attempts = 0;

  function poll() {
    attempts += 1;

    fetch("/api/store/orders/status?session_id=" + encodeURIComponent(sessionId))
      .then(function (res) {
        if (res.status === 404) {
          // Order not visible yet — keep polling within the budget.
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (data && data.ok) {
          var status = data.status;

          if (status === "paid") {
            renderPaid(data);
            clearCart();
            return; // terminal — stop polling
          }

          if (status === "expired" || status === "failed") {
            renderNotCompleted();
            return; // terminal — do NOT clear cart
          }

          // status === "awaiting_payment" (or any non-terminal) — keep waiting.
        }

        if (attempts >= MAX_ATTEMPTS) {
          renderStillProcessing();
          return;
        }

        setTimeout(poll, POLL_MS);
      })
      .catch(function () {
        if (attempts >= MAX_ATTEMPTS) {
          renderStillProcessing();
          return;
        }
        setTimeout(poll, POLL_MS);
      });
  }

  poll();
})();
