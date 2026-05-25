declare module "process" {
  const process: {
    env?: Record<string, string | undefined>;
    cwd?: () => string;
    nextTick?: (callback: () => void) => void;
    browser?: boolean;
  };

  export default process;
}

declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}
