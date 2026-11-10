import { getEnv } from "@/server/env";
import { logger } from "@/server/log";

export type EmailMessage = { to: string; subject: string; text: string };

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleTransport implements EmailTransport {
  async send(message: EmailMessage) {
    logger.info("email.sent (console transport)", { to: message.to, subject: message.subject });
  }
}

class NoopTransport implements EmailTransport {
  async send() {
    /* intentionally empty */
  }
}

export const sentEmailsForTests: EmailMessage[] = [];

export function getEmailTransport(): EmailTransport {
  const env = getEnv();
  if (env.NODE_ENV === "test") {
    return {
      async send(m) {
        sentEmailsForTests.push(m);
      },
    };
  }
  return env.EMAIL_TRANSPORT === "noop" ? new NoopTransport() : new ConsoleTransport();
}
