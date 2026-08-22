"""Minimal stdlib HTML tree parser.

Replaces BeautifulSoup. Builds just enough of a DOM -- a tree of Node
objects with tag/attrs/children/parent/text -- to support link/image/text
extraction and section classification by ancestor class/id tokens.
"""

from __future__ import annotations

from html.parser import HTMLParser
from typing import Iterator, Optional

VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
IGNORED_TEXT_TAGS = {"script", "style", "noscript", "template", "svg"}


class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "text")

    def __init__(self, tag: str, attrs: dict[str, str], parent: Optional["Node"]):
        self.tag = tag
        self.attrs = attrs
        self.children: list["Node"] = []
        self.parent = parent
        self.text = ""

    def get(self, key: str, default: str = "") -> str:
        return self.attrs.get(key, default)

    def walk(self) -> Iterator["Node"]:
        yield self
        for child in self.children:
            yield from child.walk()

    def find_all(self, *tags: str) -> list["Node"]:
        tagset = set(tags)
        return [n for n in self.walk() if n.tag in tagset]

    def ancestor_tokens(self) -> list[str]:
        """Lowercased class / id / tag tokens from this node up to the root.

        Tokenized (split on whitespace and common separators) so classifiers
        can match whole tokens like ``nav`` instead of fragile substring
        patterns such as ``\" nav \"``.
        """
        tokens: list[str] = []
        node: Optional[Node] = self
        while node is not None:
            for raw in (node.attrs.get("class", ""), node.attrs.get("id", "")):
                for part in raw.replace("_", "-").replace("/", " ").split():
                    for piece in part.split("-"):
                        piece = piece.strip().lower()
                        if piece:
                            tokens.append(piece)
            if node.tag and node.tag != "root":
                tokens.append(node.tag.lower())
            node = node.parent
        return tokens

    def ancestor_context(self) -> str:
        """Space-joined ancestor tokens (compat string for keyword `in` checks)."""
        return " ".join(self.ancestor_tokens())

    def text_content(self) -> str:
        parts = [n.text for n in self.walk() if n.tag not in IGNORED_TEXT_TAGS]
        return " ".join(p for p in parts if p)


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("root", {}, None)
        self._stack: list[Node] = [self.root]

    def handle_starttag(self, tag: str, attrs_list) -> None:
        attrs = {k: (v or "") for k, v in attrs_list}
        node = Node(tag, attrs, self._stack[-1])
        self._stack[-1].children.append(node)
        if tag not in VOID_ELEMENTS:
            self._stack.append(node)

    def handle_startendtag(self, tag: str, attrs_list) -> None:
        attrs = {k: (v or "") for k, v in attrs_list}
        self._stack[-1].children.append(Node(tag, attrs, self._stack[-1]))

    def handle_endtag(self, tag: str) -> None:
        # Walk back to the nearest matching open tag; tolerate mismatched
        # or unclosed tags instead of raising.
        for i in range(len(self._stack) - 1, 0, -1):
            if self._stack[i].tag == tag:
                del self._stack[i + 1:]
                self._stack.pop()
                return

    def handle_data(self, data: str) -> None:
        top = self._stack[-1]
        if top.tag in IGNORED_TEXT_TAGS:
            return
        if data.strip():
            top.text = f"{top.text} {data}".strip() if top.text else data.strip()


def parse(html: str) -> Node:
    builder = _TreeBuilder()
    builder.feed(html)
    return builder.root
