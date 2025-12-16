import { Copy, Check, Terminal } from "lucide-react";
import { useState } from "react";
import { getCurlCommand } from "@/hooks/useAppTweakRanking";

export const CurlDisplay = () => {
  const [copied, setCopied] = useState(false);
  const curlCommand = getCurlCommand();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glow-card rounded-xl border border-border animate-fade-in">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">cURL Request</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-primary" />
              <span className="text-primary">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="code-block m-4 mt-0">
        <pre className="text-secondary-foreground whitespace-pre-wrap break-all">
          <code>
            <span className="text-primary">curl</span>{" "}
            <span className="text-muted-foreground">--request</span> GET \{"\n"}
            {"  "}
            <span className="text-muted-foreground">--url</span>{" "}
            <span className="text-emerald-400">
              'https://public-api.apptweak.com/api/public/store/apps/category-rankings/current.json?apps=6648798962&country=us&device=iphone'
            </span>{" "}
            \{"\n"}
            {"  "}
            <span className="text-muted-foreground">--header</span>{" "}
            <span className="text-amber-400">'accept: application/json'</span> \{"\n"}
            {"  "}
            <span className="text-muted-foreground">--header</span>{" "}
            <span className="text-amber-400">'x-apptweak-key: YOUR_API_KEY'</span>
          </code>
        </pre>
      </div>
    </div>
  );
};
