const WHATSAPP_PHONE = "2348053305564";

export function whatsappUrl(message?: string) {
  const url = new URL(`https://wa.me/${WHATSAPP_PHONE}`);
  if (message) {
    url.searchParams.set("text", message);
  }
  return url.toString();
}
