// Ambient declaration for heic-convert@2.1.0 (no first-party types ship).
// Pure-JS HEIC→JPEG/PNG decoder. Input buffer is a raw byte Buffer (Pitfall 7
// in 103-RESEARCH.md — base64 strings must be Buffer.from(..., 'base64') first).
//
// Phase 103 Plan 02 — CAP-01 server-side HEIC conversion.
declare module "heic-convert" {
  function heicConvert(options: {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: "JPEG" | "PNG";
    quality?: number; // 0..1, JPEG only. Default 0.92
  }): Promise<Uint8Array>;
  export = heicConvert;
}
