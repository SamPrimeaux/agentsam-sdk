const params = new URLSearchParams(window.location.search);
if (params.get("workspace") === "typeface") {
  void import("./typeface-studio");
} else {
  void import("./main");
}
