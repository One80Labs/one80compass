# ADR 0002 — Document uploads in R1

R1 documents are private S3 objects indexed in DynamoDB. A member of the customer may upload, download, add a version, soft-delete, and restore. Permanent deletion is not in this release.

The maximum upload is 25 MiB. There is no per-customer storage quota yet. Format comparison and restore-as-version approval wait for a later release.

A new version is a new object. Completing it changes which version is current and leaves the previous object in place. Restoring a document from the recycle bin clears the deleted flag and does not replace the current version.
