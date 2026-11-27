// Jest stand-in for every `@animateicons/react/lucide/<name>-icon` module. The real files are
// ESM-only subpaths Jest cannot load, and tests do not need the motion: any named import gets a
// still icon with the same wrapper `div`, `svg` and start/stop handle.
const React = require("react");

const cache = new Map();

function stub(name) {
  if (!cache.has(name)) {
    const Icon = React.forwardRef(function AnimatedIconStub(
      { size = 24, duration: _duration, isAnimated: _isAnimated, color: _color, ...props },
      ref,
    ) {
      React.useImperativeHandle(ref, () => ({ startAnimation() {}, stopAnimation() {} }));
      return React.createElement(
        "div",
        { "data-icon": name, ...props },
        React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24" }),
      );
    });
    Icon.displayName = name;
    cache.set(name, Icon);
  }
  return cache.get(name);
}

module.exports = new Proxy(
  {},
  {
    get(_target, name) {
      if (name === "__esModule") return true;
      return typeof name === "string" ? stub(name) : undefined;
    },
  },
);
