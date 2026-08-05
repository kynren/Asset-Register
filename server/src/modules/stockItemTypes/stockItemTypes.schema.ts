import { z } from "zod";

export const createStockItemTypeSchema = z.object({
  name: z.string().min(1),
});
