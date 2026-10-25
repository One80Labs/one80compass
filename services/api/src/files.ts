import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Short-lived URLs for a private documents bucket. The API checks membership before signing. */
export function createFileSigner(bucket: string) {
  const s3 = new S3Client({});
  return {
    signUpload(objectKey: string, sizeBytes: number) {
      return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentLength: sizeBytes }), { expiresIn: 300 });
    },
    signDownload(objectKey: string, fileName: string, contentType: string) {
      const safeName = fileName.replace(/["\r\n]/g, "");
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          ResponseContentType: contentType,
          ResponseContentDisposition: `attachment; filename="${safeName}"`,
        }),
        { expiresIn: 300 },
      );
    },
  };
}
