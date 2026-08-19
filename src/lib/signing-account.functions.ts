import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SigningFieldValue } from "@/lib/signing";

export type OfficeKonnectDirectoryEntry = {
  user_id: string;
  full_name: string | null;
  email: string;
  username: string | null;
  avatar_url: string | null;
};

export const searchOfficeKonnectDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { query?: string; limit?: number }) => data)
  .handler(async ({ data, context }) => {
    const query = data.query?.trim() ?? "";
    const limit = Math.max(1, Math.min(50, data.limit ?? 20));
    const rpcClient = context.supabase as typeof context.supabase & {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: OfficeKonnectDirectoryEntry[] | null; error: { message: string } | null }>;
    };
    const { data: rows, error } = await rpcClient.rpc("search_officekonnect_directory", {
      p_query: query,
      p_limit: limit,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export type DraftSenderSigningResult = Record<string, unknown> | null;

export const completeDraftSenderSigning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      participantId: string;
      fieldValues: SigningFieldValue[];
      consentTextVersion: string;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<DraftSenderSigningResult> => {
    const rpcClient = context.supabase as typeof context.supabase & {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: DraftSenderSigningResult; error: { message: string } | null }>;
    };
    const { data: completion, error } = await rpcClient.rpc("complete_draft_sender_participant", {
      p_participant_id: data.participantId,
      p_field_values: data.fieldValues,
      p_consent_text_version: data.consentTextVersion.trim(),
    });
    if (error) throw new Error(error.message);
    return completion ?? null;
  });
