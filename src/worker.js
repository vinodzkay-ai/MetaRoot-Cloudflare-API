
export default {
  async fetch(request, env) {
    return new Response(
      JSON.stringify({
        status: "online",
        service: "MetaRoot API",
        platform: "Cloudflare Workers"
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
