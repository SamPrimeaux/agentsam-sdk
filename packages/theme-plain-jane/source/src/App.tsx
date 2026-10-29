/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { Post } from "./pages/Post";
import { About } from "./pages/About";
import { Photography } from "./pages/Photography";
import { ScrollToTop } from "./components/ScrollToTop";

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/photography" element={<Photography />} />
        <Route path="/post/:slug" element={<Post />} />
        <Route path="/case-study/:slug" element={<Post />} />
        <Route path="/contact" element={<Post />} />
        <Route path="/privacy" element={<Post />} />
        <Route path="/terms" element={<Post />} />
        <Route path="/404" element={<Post />} />
      </Routes>
    </BrowserRouter>
  );
}
