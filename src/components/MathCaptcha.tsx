import { useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MathCaptchaHandle {
  verify: () => boolean;
  reset: () => void;
}

function rand() {
  return Math.floor(Math.random() * 9) + 1;
}

export const MathCaptcha = forwardRef<MathCaptchaHandle>(function MathCaptcha(_, ref) {
  const [a, setA] = useState(rand);
  const [b, setB] = useState(rand);
  const [answer, setAnswer] = useState("");

  const reset = useCallback(() => {
    setA(rand());
    setB(rand());
    setAnswer("");
  }, []);

  useEffect(() => reset(), [reset]);

  useImperativeHandle(ref, () => ({
    verify: () => Number(answer.trim()) === a + b && answer.trim() !== "",
    reset,
  }));

  return (
    <div className="space-y-2">
      <Label htmlFor="captcha" className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Security check
      </Label>
      <div className="flex items-center gap-2">
        <div
          aria-label={`What is ${a} plus ${b}`}
          className="select-none flex h-10 min-w-[110px] items-center justify-center rounded-md border border-border bg-muted/60 px-3 font-mono text-lg font-semibold tracking-widest"
        >
          {a} + {b} =
        </div>
        <Input
          id="captcha"
          inputMode="numeric"
          required
          value={answer}
          onChange={(e) => setAnswer(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          placeholder="?"
          className="w-20 text-center font-mono text-lg"
        />
        <button
          type="button"
          onClick={reset}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="New question"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
