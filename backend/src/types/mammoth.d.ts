declare module 'mammoth' {
  interface RawTextResult {
    messages: unknown[];
    value: string;
  }
  export function extractRawText(input: { buffer: Buffer }): Promise<RawTextResult>;
  const mammoth: { extractRawText: typeof extractRawText };
  export default mammoth;
}
