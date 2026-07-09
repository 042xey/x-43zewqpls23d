const WEBMAIL_URL= "https://your-webmail.app";

export default function WebmailTab() {
  return (
    <div className="p-6 h-[calc(100vh-8rem)] flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Webmail</h2>
      <div className="flex-1 border rounded-lg overflow-hidden">
        <iframe src={`${WEBMAIL_URL}/inbox`} title="Webmail" className="w-full h-full" />
      </div>
    </div>
  );
}