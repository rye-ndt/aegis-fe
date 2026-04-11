import { z } from 'zod';

export const toolManifestSchema = z.object({
  toolId: z.string()
    .min(3, "Must be at least 3 characters")
    .max(64, "Must be under 64 characters")
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  name: z.string().min(1, "Name is required").max(100),
  protocolName: z.string().min(1, "Protocol is required").max(100),
  category: z.enum(["erc20_transfer", "swap", "contract_interaction"]),
  description: z.string().min(10, "Description must be at least 10 chars").max(500),
  tags: z.string().min(1, "At least one tag is required (comma separated)"),
  chainIds: z.array(z.number()).min(1, "Select at least one chain"),
  priority: z.coerce.number().min(0).max(100).default(0),
  isDefault: z.boolean().default(false),
  revenueWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address").optional().or(z.literal("")),
  inputSchemaString: z.string().refine((val) => {
    try {
      JSON.parse(val);
      return true;
    } catch (e) {
      return false;
    }
  }, { message: "Invalid JSON Schema" }),
  
  steps: z.array(z.any()).min(1, "At least one step required")
}).superRefine((data, ctx) => {
  const stepNames = new Set<string>();
  
  data.steps.forEach((step, index) => {
    if (!step.name || step.name.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps', index, 'name'],
        message: 'Step name is required'
      });
    } else {
      if (stepNames.has(step.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'name'],
          message: 'Step names must be unique'
        });
      }
      stepNames.add(step.name);
    }
    
    if (step.kind === 'abi_encode' && (!step.contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(step.contractAddress))) {
      ctx.addIssue({
         code: z.ZodIssueCode.custom,
         path: ['steps', index, 'contractAddress'],
         message: 'Invalid EVM address'
      });
    }
  });

  const lastStep = data.steps[data.steps.length - 1];
  const validFinalKinds = ['abi_encode', 'calldata_passthrough', 'erc20_transfer'];
  
  if (lastStep && !validFinalKinds.includes(lastStep.kind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['steps', data.steps.length - 1, 'kind'],
      message: 'Last step must produce a transaction (abi_encode, calldata_passthrough, or erc20_transfer)'
    });
  }
});
