import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Short-lived URLs for a private documents bucket. The API checks membership before signing. */
export function createFileSigner(bucket: string) {
  const s3 = new S3Client({});
  return {
    signUpload(objectKey: string, sizeBytes: number) {
      return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentLength: sizeBytes }), { expiresIn: 300 });
    },
    /**
     * Signs a GET URL. Use disposition `inline` for in-app preview (PDF/image/text);
     * `attachment` forces a download.
     */
    signDownload(objectKey: string, fileName: string, contentType: string, disposition: "attachment" | "inline" = "attachment") {
      const safeName = fileName.replace(/["\r\n]/g, "");
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          ResponseContentType: contentType,
          ResponseContentDisposition: `${disposition}; filename="${safeName}"`,
        }),
        { expiresIn: 300 },
      );
    },
    /** True when the object exists and, when expectedBytes is set, matches ContentLength. */
    async objectExists(objectKey: string, expectedBytes?: number): Promise<boolean> {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
        if (expectedBytes != null && head.ContentLength != null && head.ContentLength !== expectedBytes) return false;
        return true;
      } catch {
        return false;
      }
    },
    /** Store published status report text beside project documents. */
    putReportText(objectKey: string, body: string) {
      return s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: body,
          ContentType: "text/markdown; charset=utf-8",
        }),
      ).then(() => undefined);
    },
  };
}
