/**
 * The `debug` package, as nothing: what the production build gets in its place
 * (vite.config.ts). applesauce logs through it, and in a visitor's browser it
 * only ever writes when `localStorage.debug` asks it to — ~12 KB of code to say
 * nothing. The dev server keeps the real one, so `localStorage.debug =
 * "applesauce*"` still traces relays there.
 *
 * The same shape as `debug`'s default export, as far as anything here calls it:
 * a logger is a function, `extend` makes a child, and none is ever enabled.
 */
export interface Debugger {
  (...args: unknown[]): void;
  namespace: string;
  enabled: boolean;
  log: (...args: unknown[]) => void;
  extend: (namespace: string, delimiter?: string) => Debugger;
  destroy: () => boolean;
}

const quiet = () => {};

function createDebug(namespace = ""): Debugger {
  const logger = (() => {}) as unknown as Debugger;
  logger.namespace = namespace;
  logger.enabled = false;
  logger.log = quiet;
  logger.destroy = () => true;
  logger.extend = (child, delimiter = ":") => createDebug(`${namespace}${delimiter}${child}`);
  return logger;
}

createDebug.enable = (_namespaces?: string) => {};
createDebug.disable = () => "";
createDebug.enabled = (_namespace?: string) => false;
createDebug.log = quiet;
createDebug.formatters = {} as Record<string, (value: unknown) => string>;

export default createDebug;
