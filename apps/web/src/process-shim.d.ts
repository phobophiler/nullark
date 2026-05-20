declare module "process" {
  const process: {
    env?: Record<string, string | undefined>;
    nextTick?: (callback: () => void) => void;
    browser?: boolean;
  };

  export default process;
}
