import { useListDevUsers, useSendTestTweakRequest, type TweakRequestInput } from "@workspace/api-client-react";
import { apiErrorMessage } from "@/lib/format";

const SAMPLE_REQUEST: TweakRequestInput = {
  appName: "CYBAZONE",
  title: "Test request: delivery check",
  currentBehavior: "This is a test request sent from the ASTRA dev section. It checks that requests reach the repo and inboxes.",
  desiredBehavior: "Nothing should change in the app. This request only confirms that the Requests folder receives a text file and that update emails are delivered to every ticked recipient.",
  location: "No screens — delivery test only.",
  userFlow: "1. Owner clicks Send sample test request\n2. A TEST_ file appears in Requests\n3. Update emails arrive",
  acceptanceCriteria: "- TEST_ file is in the Requests folder\n- Owner receives the [TEST] email",
  priority: "low",
};

export function TestRequests() {
  const { data: devs } = useListDevUsers();
  const sendTest = useSendTestTweakRequest();
  const tickedCount = devs?.filter((d) => d.receiveUpdates).length ?? 0;
  return (
    <div data-testid="block-test-requests">
      <h3 className="text-lg font-semibold text-foreground">Test requests</h3>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        Sends a sample request through the real flow: a <span className="font-mono text-foreground">TEST_</span> file in the repo's Requests folder (marked "do not implement") and a [TEST] email to you{tickedCount > 0 ? ` and ${tickedCount} ticked dev${tickedCount > 1 ? "s" : ""}` : ""}. To test your own wording, tick "Send as a test request" on the form below.
      </p>
      <button type="button" onClick={() => sendTest.mutate({ data: SAMPLE_REQUEST })} disabled={sendTest.isPending}
        className="mt-5 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60" data-testid="button-send-sample-test">
        {sendTest.isPending ? "Sending…" : "Send sample test request"}
      </button>
      {sendTest.data && (
        <p className="mt-3 text-sm text-foreground" role="status" data-testid="text-test-result">
          Saved as <span className="font-mono">{sendTest.data.fileName}</span>.{" "}
          {sendTest.data.emailed ? "Email sent to you." : "The email to you didn't go out — check the server logs."}
        </p>
      )}
      {sendTest.isError && (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid="text-test-error">
          {apiErrorMessage(sendTest.error, "Couldn't send the test request.")}
        </p>
      )}
    </div>
  );
}
