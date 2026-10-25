#include "sketch_solver.hpp"
#include <algorithm>
#include <cmath>
#include <map>
#include <stdexcept>
#include <vector>
namespace agentsam {
namespace j = boost::json;
static double number(const j::value &v) {
  double n = v.is_double()   ? v.as_double()
             : v.is_int64()  ? double(v.as_int64())
             : v.is_uint64() ? double(v.as_uint64())
                             : NAN;
  if (!std::isfinite(n))
    throw std::runtime_error("sketch_number_invalid");
  return n;
}
static std::string str(const j::value &v) { return std::string(v.as_string()); }
static std::vector<double> linear(std::vector<std::vector<double>> a,
                                  std::vector<double> b) {
  size_t n = b.size();
  for (size_t k = 0; k < n; ++k) {
    size_t pivot = k;
    for (size_t i = k + 1; i < n; ++i)
      if (std::abs(a[i][k]) > std::abs(a[pivot][k]))
        pivot = i;
    if (std::abs(a[pivot][k]) < 1e-18)
      throw std::runtime_error("sketch_singular");
    std::swap(a[k], a[pivot]);
    std::swap(b[k], b[pivot]);
    double d = a[k][k];
    for (size_t t = k; t < n; ++t)
      a[k][t] /= d;
    b[k] /= d;
    for (size_t i = 0; i < n; ++i)
      if (i != k) {
        double f = a[i][k];
        for (size_t t = k; t < n; ++t)
          a[i][t] -= f * a[k][t];
        b[i] -= f * b[k];
      }
  }
  return b;
}
j::object solveSketch(const j::object &request) {
  const auto &points = request.at("points").as_array();
  const auto &constraints = request.at("constraints").as_array();
  if (points.empty() || points.size() > 64 || constraints.size() > 256)
    throw std::runtime_error("sketch_size_invalid");
  std::map<std::string, size_t> ids;
  std::vector<double> x;
  for (const auto &p : points) {
    const auto &o = p.as_object();
    auto id = str(o.at("id"));
    if (!ids.emplace(id, x.size()).second)
      throw std::runtime_error("sketch_duplicate_point");
    x.push_back(number(o.at("x")));
    x.push_back(number(o.at("y")));
  }
  auto residual = [&](const std::vector<double> &v) {
    std::vector<double> r;
    auto index = [&](const j::object &o, const char *k) {
      auto it = ids.find(str(o.at(k)));
      if (it == ids.end())
        throw std::runtime_error("sketch_point_missing");
      return it->second;
    };
    for (const auto &c : constraints) {
      const auto &o = c.as_object();
      auto t = str(o.at("type"));
      size_t a = index(o, "a");
      if (t == "fixed") {
        r.push_back(v[a] - number(o.at("x")));
        r.push_back(v[a + 1] - number(o.at("y")));
        continue;
      }
      size_t b = index(o, "b");
      double dx = v[b] - v[a], dy = v[b + 1] - v[a + 1];
      if (t == "horizontal")
        r.push_back(dy);
      else if (t == "vertical")
        r.push_back(dx);
      else if (t == "coincident") {
        r.push_back(dx);
        r.push_back(dy);
      } else if (t == "distance") {
        double d = number(o.at("value"));
        if (d < 0)
          throw std::runtime_error("sketch_distance_invalid");
        r.push_back(std::hypot(dx, dy) - d);
      } else if (t == "parallel" || t == "perpendicular" ||
                 t == "equalLength") {
        size_t cc = index(o, "c"), d = index(o, "d");
        double ex = v[d] - v[cc], ey = v[d + 1] - v[cc + 1],
               len = std::hypot(dx, dy), len2 = std::hypot(ex, ey);
        if (t == "equalLength")
          r.push_back(len - len2);
        else {
          if (len < 1e-9 || len2 < 1e-9)
            throw std::runtime_error("sketch_degenerate_segment");
          r.push_back(
              (t == "parallel" ? dx * ey - dy * ex : dx * ex + dy * ey) /
              std::max(len, len2));
        }
      } else
        throw std::runtime_error("sketch_constraint_unsupported");
    }
    return r;
  };
  auto jacobian = [&](const std::vector<double> &v,
                      const std::vector<double> &r) {
    std::vector<std::vector<double>> a(r.size(), std::vector<double>(v.size()));
    for (size_t k = 0; k < v.size(); ++k) {
      auto y = v;
      double h = 1e-5;
      y[k] += h;
      auto s = residual(y);
      for (size_t i = 0; i < r.size(); ++i)
        a[i][k] = (s[i] - r[i]) / h;
    }
    return a;
  };
  auto norm = [](const std::vector<double> &r) {
    double s = 0;
    for (double v : r)
      s += v * v;
    return s;
  };
  double lambda = 1e-3;
  int iterations = 0;
  auto r = residual(x);
  for (; iterations < 100 && norm(r) > 1e-14; ++iterations) {
    auto a = jacobian(x, r);
    size_t n = x.size();
    std::vector<std::vector<double>> h(n, std::vector<double>(n));
    std::vector<double> g(n);
    for (size_t i = 0; i < r.size(); ++i)
      for (size_t k = 0; k < n; ++k) {
        g[k] -= a[i][k] * r[i];
        for (size_t l = 0; l < n; ++l)
          h[k][l] += a[i][k] * a[i][l];
      }
    for (size_t k = 0; k < n; ++k)
      h[k][k] += lambda;
    auto delta = linear(h, g);
    auto y = x;
    for (size_t k = 0; k < n; ++k)
      y[k] += delta[k];
    auto s = residual(y);
    if (norm(s) < norm(r)) {
      x = y;
      r = s;
      lambda = std::max(1e-12, lambda * .2);
    } else
      lambda = std::min(1e12, lambda * 10);
  }
  auto a = jacobian(x, r);
  size_t rank = 0;
  for (size_t col = 0; col < x.size() && rank < a.size(); ++col) {
    size_t p = rank;
    for (size_t row = rank + 1; row < a.size(); ++row)
      if (std::abs(a[row][col]) > std::abs(a[p][col]))
        p = row;
    if (std::abs(a[p][col]) < 1e-7)
      continue;
    std::swap(a[p], a[rank]);
    double d = a[rank][col];
    for (size_t c = col; c < x.size(); ++c)
      a[rank][c] /= d;
    for (size_t row = rank + 1; row < a.size(); ++row) {
      double f = a[row][col];
      for (size_t c = col; c < x.size(); ++c)
        a[row][c] -= f * a[rank][c];
    }
    ++rank;
  }
  double max = 0;
  for (double v : r)
    max = std::max(max, std::abs(v));
  size_t dof = x.size() - rank;
  j::array solved;
  for (const auto &p : points) {
    auto o = p.as_object();
    size_t k = ids.at(str(o.at("id")));
    o["x"] = x[k];
    o["y"] = x[k + 1];
    solved.push_back(o);
  }
  return {{"converged", max <= 1e-5},
          {"status", max > 1e-5 ? "inconsistent"
                     : dof      ? "underconstrained"
                                : "constrained"},
          {"degreesOfFreedom", dof},
          {"maxResidual", max},
          {"iterations", iterations},
          {"points", solved}};
}
} // namespace agentsam
