import { Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type GithubRepositoryStatus = "yes" | "no" | "unknown";

export function GithubRepositoryFields({ status, urls, onStatusChange, onUrlsChange }: {
  status: GithubRepositoryStatus;
  urls: string[];
  onStatusChange: (status: GithubRepositoryStatus) => void;
  onUrlsChange: (urls: string[]) => void;
}) {
  return (
    <fieldset className="space-y-3" aria-describedby="co-github-help">
      <legend className="mb-2 text-sm font-medium">Does this project run on at least one GitHub repository?</legend>
      <select
        aria-label="Does this project run on at least one GitHub repository?"
        aria-describedby="co-github-help"
        value={status}
        onChange={(event) => {
          const answer = event.target.value as GithubRepositoryStatus;
          onStatusChange(answer);
          if (answer === "no") onUrlsChange([""]);
        }}
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="select-checkout-github"
      >
        <option value="unknown">Leave blank if you're not sure</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <p id="co-github-help" className="text-xs leading-relaxed text-muted-foreground">
        If yes, provide your GitHub repository links (up to 100). If you don't know whether your project is connected to a repository, leave this blank.
      </p>
      {status !== "no" && (
        <div className="space-y-2">
          {urls.map((url, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`co-github-${index}`} className="text-xs">Repository link {index + 1}</Label>
                <Input id={`co-github-${index}`} type="url" placeholder="https://github.com/owner/repository"
                  value={url} maxLength={300} aria-describedby="co-github-help"
                  onChange={(event) => onUrlsChange(urls.map((value, i) => i === index ? event.target.value : value))}
                  className="h-11 rounded-xl" data-testid={`input-checkout-github-${index}`} />
              </div>
              <button type="button" disabled={urls.length === 1} aria-label={`Remove repository link ${index + 1}`}
                onClick={() => onUrlsChange(urls.filter((_, i) => i !== index))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-input hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                data-testid={`button-remove-github-${index}`}>
                <Minus className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" disabled={urls.length >= 100} onClick={() => onUrlsChange([...urls, ""])}
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            data-testid="button-add-github">
            <Plus className="h-4 w-4" /> Add repository link <span className="text-muted-foreground">({urls.length}/100)</span>
          </button>
        </div>
      )}
    </fieldset>
  );
}