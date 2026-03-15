const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;

export function isMsg91Configured(): boolean {
  return !!MSG91_AUTH_KEY && !!MSG91_TEMPLATE_ID;
}

export async function sendOtpViaMSG91(
  phone: string,
  otp: string,
): Promise<boolean> {
  if (!MSG91_AUTH_KEY) {
    console.log("[MSG91] AUTH_KEY not configured, using demo mode");
    return false;
  }

  if (!MSG91_TEMPLATE_ID) {
    console.log("[MSG91] TEMPLATE_ID not configured, using demo mode");
    return false;
  }

  try {
    const params = new URLSearchParams({
      authkey: MSG91_AUTH_KEY,
      template_id: MSG91_TEMPLATE_ID,
      mobile: `91${phone}`,
      otp,
      otp_length: "6",
      otp_expiry: "10",
    });

    const response = await fetch(`https://control.msg91.com/api/v5/otp?${params.toString()}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    const raw = await response.text();
    let data: any;

    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    console.log(`[MSG91] OTP response for ${phone}:`, {
      status: response.status,
      ok: response.ok,
      type: data?.type,
      message: data?.message,
      requestId: data?.request_id || data?.requestId,
      raw,
    });

    return response.ok && data?.type === "success";
  } catch (error) {
    console.error("[MSG91] Failed to send OTP:", error);
    return false;
  }
}
