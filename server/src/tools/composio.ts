import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Composio } from "@composio/core";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Composio client singleton
// ---------------------------------------------------------------------------

let composioClient: Composio | null = null;

function getComposio(): Composio {
  if (!composioClient) {
    composioClient = new Composio({ apiKey: config.composioApiKey });
  }
  return composioClient;
}

// ---------------------------------------------------------------------------
// Connection management helpers (used by the routes layer)
// ---------------------------------------------------------------------------

/**
 * Initiate an OAuth connection for a toolkit.
 * Uses `toolkits.authorize` which resolves the auth config for the toolkit
 * automatically; falls back to `connectedAccounts.initiate` when an explicit
 * authConfigId is supplied.
 */
export async function initiateConnection(
  userId: string,
  toolkit: string,
  callbackUrl: string
) {
  const composio = getComposio();

  // Look up the auth config for this toolkit
  const configs = await composio.authConfigs.list({ toolkit });
  const authConfig = configs.items?.[0];
  if (!authConfig) {
    throw new Error(
      `No auth config found for toolkit "${toolkit}". Create one at platform.composio.dev → Auth Configs.`
    );
  }

  const connRequest = await composio.connectedAccounts.initiate(
    userId,
    authConfig.id,
    { callbackUrl }
  );
  return {
    redirectUrl: connRequest.redirectUrl ?? null,
    connectionId: connRequest.id,
  };
}

/**
 * Check which toolkits the user has active connections for.
 */
export async function getActiveConnections(userId: string): Promise<unknown[]> {
  const composio = getComposio();
  const connections = await composio.connectedAccounts.list({
    userIds: [userId],
    statuses: ["ACTIVE"],
  });
  return (connections.items ?? []) as unknown[];
}

// ---------------------------------------------------------------------------
// Direct tool execution helper
// ---------------------------------------------------------------------------

export async function executeTool(
  userId: string,
  toolName: string,
  args: Record<string, unknown>
) {
  const composio = getComposio();
  return composio.tools.execute(toolName, {
    userId,
    arguments: args,
    dangerouslySkipVersionCheck: true,
  });
}

// ---------------------------------------------------------------------------
// Return type shared by every agent tool execute function
// ---------------------------------------------------------------------------

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: undefined;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

function fail(e: unknown): ToolResult {
  const msg = e instanceof Error ? e.message : String(e);
  return ok(`Error: ${msg}`);
}

async function run(
  userId: string,
  action: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const result = await executeTool(userId, action, args);
    if (result.error) {
      return ok(`Composio error: ${result.error}`);
    }
    return ok(JSON.stringify(result.data, null, 2));
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Agent tools factory
// ---------------------------------------------------------------------------

export function createComposioTools(userId: string): AgentTool<any>[] {
  // If no Composio API key is configured, return an empty array so the
  // server can still boot without Composio.
  if (!config.composioApiKey) {
    return [];
  }

  // ---- Gmail tools --------------------------------------------------------

  const gmailSendEmail: AgentTool<any> = {
    name: "gmail_send_email",
    label: "Send Email (Gmail)",
    description:
      "Send an email via the user's connected Gmail account.",
    parameters: Type.Object({
      to: Type.String({ description: "Recipient email address" }),
      subject: Type.String({ description: "Email subject line" }),
      body: Type.String({ description: "Email body (plain text or HTML)" }),
      cc: Type.Optional(
        Type.String({ description: "CC email address(es), comma-separated" })
      ),
      bcc: Type.Optional(
        Type.String({ description: "BCC email address(es), comma-separated" })
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<ToolResult> => {
      return run(userId, "GMAIL_SEND_EMAIL", {
        to: params.to,
        subject: params.subject,
        body: params.body,
        ...(params.cc ? { cc: params.cc } : {}),
        ...(params.bcc ? { bcc: params.bcc } : {}),
      });
    },
  };

  const gmailListEmails: AgentTool<any> = {
    name: "gmail_list_emails",
    label: "List Emails (Gmail)",
    description:
      "List or search emails in the user's Gmail inbox. Supports Gmail search query syntax (e.g. 'from:john subject:meeting').",
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({
          description:
            "Gmail search query, e.g. 'from:john subject:meeting'. Leave empty to list recent emails.",
        })
      ),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum number of emails to return (default 10)",
        })
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<ToolResult> => {
      return run(userId, "GMAIL_FETCH_EMAILS", {
        ...(params.query ? { query: params.query } : {}),
        max_results: params.maxResults ?? 10,
      });
    },
  };

  const gmailReadEmail: AgentTool<any> = {
    name: "gmail_read_email",
    label: "Read Email (Gmail)",
    description: "Read a specific email by its message ID.",
    parameters: Type.Object({
      messageId: Type.String({ description: "The Gmail message ID to read" }),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<ToolResult> => {
      return run(userId, "GMAIL_GET_MESSAGE", {
        message_id: params.messageId,
      });
    },
  };

  // ---- Google Calendar tools ----------------------------------------------

  const calendarCreateEvent: AgentTool<any> = {
    name: "calendar_create_event",
    label: "Create Calendar Event",
    description:
      "Create a new event on the user's Google Calendar.",
    parameters: Type.Object({
      summary: Type.String({ description: "Event title / summary" }),
      startTime: Type.String({
        description: "Start time in ISO 8601 format (e.g. 2025-03-20T10:00:00Z)",
      }),
      endTime: Type.String({
        description: "End time in ISO 8601 format (e.g. 2025-03-20T11:00:00Z)",
      }),
      description: Type.Optional(
        Type.String({ description: "Event description" })
      ),
      attendees: Type.Optional(
        Type.String({
          description: "Comma-separated list of attendee email addresses",
        })
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<ToolResult> => {
      const args: Record<string, unknown> = {
        summary: params.summary,
        start_time: params.startTime,
        end_time: params.endTime,
      };
      if (params.description) args.description = params.description;
      if (params.attendees) {
        args.attendees = params.attendees
          .split(",")
          .map((e: string) => e.trim());
      }
      return run(userId, "GOOGLECALENDAR_CREATE_EVENT", args);
    },
  };

  const calendarListEvents: AgentTool<any> = {
    name: "calendar_list_events",
    label: "List Calendar Events",
    description:
      "List upcoming events from the user's Google Calendar.",
    parameters: Type.Object({
      timeMin: Type.Optional(
        Type.String({
          description: "Minimum time bound in ISO 8601 format",
        })
      ),
      timeMax: Type.Optional(
        Type.String({
          description: "Maximum time bound in ISO 8601 format",
        })
      ),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum number of events to return (default 10)",
        })
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<ToolResult> => {
      const args: Record<string, unknown> = {
        max_results: params.maxResults ?? 10,
      };
      if (params.timeMin) args.time_min = params.timeMin;
      if (params.timeMax) args.time_max = params.timeMax;
      return run(userId, "GOOGLECALENDAR_EVENTS_LIST", args);
    },
  };

  // ---- Google Drive tools -------------------------------------------------

  const driveSearchFiles: AgentTool<any> = {
    name: "drive_search_files",
    label: "Search Google Drive",
    description:
      "Search for files in the user's Google Drive.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query for finding files in Google Drive",
      }),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<ToolResult> => {
      return run(userId, "GOOGLEDRIVE_SEARCH_FILE", {
        query: params.query,
      });
    },
  };

  // ---- Salesforce tools ---------------------------------------------------

  const salesforceSearch: AgentTool<any> = {
    name: "salesforce_search",
    label: "Search Salesforce",
    description:
      "Search Salesforce records using SOQL or natural language. You can filter by object type (Lead, Contact, Account, etc.).",
    parameters: Type.Object({
      query: Type.String({
        description:
          "SOQL query or natural language search string",
      }),
      objectType: Type.Optional(
        Type.String({
          description:
            'Salesforce object type to search, e.g. "Lead", "Contact", "Account"',
        })
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<ToolResult> => {
      const args: Record<string, unknown> = { query: params.query };
      if (params.objectType) args.object_type = params.objectType;
      return run(userId, "SALESFORCE_SOQL_QUERY", args);
    },
  };

  const salesforceCreateLead: AgentTool<any> = {
    name: "salesforce_create_lead",
    label: "Create Salesforce Lead",
    description:
      "Create a new lead in Salesforce with the provided details.",
    parameters: Type.Object({
      firstName: Type.String({ description: "Lead first name" }),
      lastName: Type.String({ description: "Lead last name" }),
      email: Type.String({ description: "Lead email address" }),
      company: Type.String({ description: "Lead company name" }),
      title: Type.Optional(
        Type.String({ description: "Lead job title" })
      ),
      phone: Type.Optional(
        Type.String({ description: "Lead phone number" })
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<ToolResult> => {
      const args: Record<string, unknown> = {
        first_name: params.firstName,
        last_name: params.lastName,
        email: params.email,
        company: params.company,
      };
      if (params.title) args.title = params.title;
      if (params.phone) args.phone = params.phone;
      return run(userId, "SALESFORCE_CREATE_LEAD", args);
    },
  };

  const salesforceUpdateRecord: AgentTool<any> = {
    name: "salesforce_update_record",
    label: "Update Salesforce Record",
    description:
      "Update an existing Salesforce record by its ID.",
    parameters: Type.Object({
      recordId: Type.String({ description: "The Salesforce record ID" }),
      objectType: Type.String({
        description:
          'The Salesforce object type, e.g. "Lead", "Contact", "Account"',
      }),
      fields: Type.Record(Type.String(), Type.Unknown(), {
        description:
          "Key-value pairs of fields to update on the record",
      }),
    }),
    execute: async (
      _toolCallId: string,
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: any
    ): Promise<ToolResult> => {
      return run(userId, "SALESFORCE_UPDATE_RECORD", {
        record_id: params.recordId,
        object_type: params.objectType,
        fields: params.fields,
      });
    },
  };

  return [
    gmailSendEmail,
    gmailListEmails,
    gmailReadEmail,
    calendarCreateEvent,
    calendarListEvents,
    driveSearchFiles,
    salesforceSearch,
    salesforceCreateLead,
    salesforceUpdateRecord,
  ];
}
