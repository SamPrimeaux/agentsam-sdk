import { optimizeRasterBuffer } from "../../backend/assets/worker-image.js";
export default {
  async fetch(request) {
    if (request.method !== "POST") return new Response("POST an image", {status:405});
    try {
      const mime = request.headers.get("content-type") || "image/png";
      const preferWebp = request.headers.get("x-test-output") === "webp";
      const result = await optimizeRasterBuffer(await request.arrayBuffer(), mime,
        { maxWidth: 128, keepAlpha: mime === "image/png" && !preferWebp, preferWebp });
      return new Response(result.bytes, { status: 200, headers: {
        "content-type":result.contentType,
        "x-processed-width":String(result.width), "x-processed-height":String(result.height),
      }});
    } catch(error) { return Response.json({error:String(error?.message||error)}, {status:500}); }
  },
};
