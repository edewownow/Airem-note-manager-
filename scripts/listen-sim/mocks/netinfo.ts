export const net = { online: true };
export default {
  async fetch() { return { isConnected: net.online, isInternetReachable: net.online }; },
  addEventListener() { return () => {}; },
};
