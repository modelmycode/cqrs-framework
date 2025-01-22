import { ZodSchema } from 'zod'

export const commandSchemas = new Map<string, ZodSchema | (() => ZodSchema)>()