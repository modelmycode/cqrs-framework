import { AnySchema } from 'yup'

export const commandSchemas = new Map<string, AnySchema | (() => AnySchema)>()
