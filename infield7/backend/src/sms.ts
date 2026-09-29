import bcrypt from "bcryptjs";

export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

function stubProvider(): SmsProvider {
  return {
    async send(phone, message) {
      console.log(`[sms:stub] ${phone}: ${message}`);
    },
  };
}

function liveProvider(name: string): SmsProvider {
  return {
    async send() {
      throw new Error(`${name} is not configured. Set SMS_PROVIDER=stub for local development.`);
    },
  };
}

export function createSmsProvider(): SmsProvider {
  const name = process.env.SMS_PROVIDER ?? "stub";
  if (name === "stub") return stubProvider();
  if (name === "msg91" || name === "twilio") return liveProvider(name);
  throw new Error(`Unknown SMS_PROVIDER "${name}"`);
}

const sms = createSmsProvider();

export async function deliverOtp(e164: string, code: string) {
  const message = `InField 7 code: ${code}. It expires in 10 minutes.`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await sms.send(e164, message);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("SMS send failed");
}

export function hashCode(code: string) {
  return bcrypt.hash(code, 8);
}

export function checkCode(code: string, hash: string) {
  return bcrypt.compare(code, hash);
}

export function isStubSms() {
  return (process.env.SMS_PROVIDER ?? "stub") === "stub";
}
