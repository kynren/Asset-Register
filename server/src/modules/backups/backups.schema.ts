import { z } from "zod";

export const updateBackupSettingsSchema = z.object({
  isEnabled: z.boolean(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
});

const emailFields = { emailTo: z.string().email() };
const s3Fields = {
  s3Endpoint: z.string().optional(),
  s3Region: z.string().optional(),
  s3Bucket: z.string().min(1),
  s3AccessKeyId: z.string().min(1),
  s3SecretAccessKey: z.string().min(1),
  s3PathPrefix: z.string().optional(),
  s3ForcePathStyle: z.boolean().optional(),
};

export const createBackupDestinationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EMAIL"), name: z.string().min(1), isEnabled: z.boolean().optional(), ...emailFields }),
  z.object({ type: z.literal("S3"), name: z.string().min(1), isEnabled: z.boolean().optional(), ...s3Fields }),
]);

// On update, the S3 secret key is optional — leaving it blank keeps the currently stored
// (encrypted) value rather than forcing it to be re-entered every time the name or bucket changes.
export const updateBackupDestinationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EMAIL"), name: z.string().min(1), isEnabled: z.boolean().optional(), ...emailFields }),
  z.object({
    type: z.literal("S3"),
    name: z.string().min(1),
    isEnabled: z.boolean().optional(),
    s3Endpoint: z.string().optional(),
    s3Region: z.string().optional(),
    s3Bucket: z.string().min(1),
    s3AccessKeyId: z.string().min(1),
    s3SecretAccessKey: z.string().optional(),
    s3PathPrefix: z.string().optional(),
    s3ForcePathStyle: z.boolean().optional(),
  }),
]);
