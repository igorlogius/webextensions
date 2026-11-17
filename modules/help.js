// Adds two small "Get help" / "Report an issue" icon buttons to the
// bottom right corner of a page. Load it at the end of the page:
//   <script type="module" src="help.js"></script>
import { helpUrl, bugUrl, createIcon } from "./links.js";

const css = `
#x-help-buttons {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 2147483000;
  display: flex;
  gap: 6px;
}
#x-help-buttons a {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 1px solid var(--border, #cfcfd8);
  background: var(--surface, Canvas);
  color: var(--muted, GrayText);
  box-shadow: var(--shadow, 0 1px 4px rgb(0 0 0 / 0.2));
  opacity: 0.75;
  text-decoration: none;
}
#x-help-buttons a:hover,
#x-help-buttons a:focus-visible {
  opacity: 1;
  color: var(--accent, LinkText);
  border-color: var(--accent, LinkText);
}
`;

const makeButton = (href, title, icon) => {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = title;
  a.setAttribute("aria-label", title);
  a.appendChild(createIcon(icon));
  return a;
};

const mount = () => {
  if (document.getElementById("x-help-buttons")) {
    return;
  }
  const style = document.createElement("style");
  style.textContent = css;
  const box = document.createElement("div");
  box.id = "x-help-buttons";
  box.append(
    makeButton(helpUrl(), "Get help", "help"),
    makeButton(bugUrl(), "Report an issue", "bug"),
  );
  document.head.appendChild(style);
  document.body.appendChild(box);
};

mount();
