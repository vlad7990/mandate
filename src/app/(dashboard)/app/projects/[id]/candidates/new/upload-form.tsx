"use client";

import Link from "next/link";
import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadAndParseCv } from "../actions";
import {
  IconArrowLeft,
  IconDocument,
  IconRefresh,
  IconShield,
  IconSpark,
  IconUpload,
} from "@/components/icons";
import { unwrap } from "@/lib/actions/result";

const ACCEPTED_EXTENSIONS = ".pdf,.docx";
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type Props = {
  projectId: string;
  roleTitle: string;
  companyName: string;
};

export function CvUploadForm({ projectId, roleTitle, companyName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isPending, startTransition] = useTransition();

  const acceptFile = (candidate: File | null) => {
    if (!candidate) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_MIMES.has(candidate.type)) {
      toast.error("Unsupported file type. Upload a PDF or DOCX.");
      return;
    }
    if (candidate.size > MAX_BYTES) {
      toast.error(
        `File is ${(candidate.size / 1024 / 1024).toFixed(1)}MB; max is 10MB.`
      );
      return;
    }
    if (candidate.size === 0) {
      toast.error("File is empty.");
      return;
    }
    setFile(candidate);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0] ?? null);
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragActive(false);
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  };

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a CV file first.");
      return;
    }
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("projectId", projectId);
        formData.set("cv", file);
        unwrap(await uploadAndParseCv(formData));
        // The action redirects on success — control normally won't reach here.
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Upload + parse failed.";
        if (msg.includes("NEXT_REDIRECT")) return;
        console.error("[candidates] upload failed:", err);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-8">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/projects/${projectId}/candidates`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Candidates
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Add Candidate</span>
        </div>

        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              CV Intake
            </span>
          </div>
          <h1 className="font-h1 text-h1">Upload a candidate CV</h1>
          <p className="text-body-main text-on-surface-variant max-w-2xl">
            Drop a PDF or DOCX. The CV Parsing Agent will extract role
            history, scale, tech exposure, archetype, and a fit-vs-role
            analysis against{" "}
            <span className="text-on-surface">{roleTitle}</span> @{" "}
            <span className="text-on-surface">{companyName}</span> in one
            pass. Takes ~5–10 seconds.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <label
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            htmlFor="cv-input"
            className={cn(
              "block border-2 border-dashed bg-surface-container-low p-10 cursor-pointer transition-colors",
              dragActive
                ? "border-primary bg-primary-container/10"
                : "border-outline-variant hover:border-primary",
              isPending && "pointer-events-none opacity-70"
            )}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              {file ? (
                <IconDocument
                  size={40}
                  className="text-primary transition-colors"
                />
              ) : (
                <IconUpload
                  size={40}
                  className="text-outline transition-colors"
                />
              )}
              {file ? (
                <div className="space-y-2">
                  <div className="font-mono-data text-body-main text-on-surface break-all">
                    {file.name}
                  </div>
                  <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    {file.type === "application/pdf" ? "PDF" : "DOCX"} ·{" "}
                    {(file.size / 1024).toFixed(0)} KB
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                    className="font-mono-label text-mono-label text-outline uppercase tracking-widest underline underline-offset-4 hover:text-primary transition-colors"
                  >
                    Choose a different file
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-on-surface text-body-main font-semibold">
                    Drag a CV here, or click to browse
                  </div>
                  <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    PDF or DOCX · 10 MB max
                  </div>
                </div>
              )}
            </div>
            <input
              ref={inputRef}
              id="cv-input"
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleInputChange}
              disabled={isPending}
              className="sr-only"
            />
          </label>

          <div className="flex justify-between items-center flex-wrap gap-3">
            <Link
              href={`/app/projects/${projectId}/candidates`}
              prefetch={false}
              className="font-mono-label text-mono-label text-outline uppercase tracking-widest hover:text-on-surface transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!file || isPending}
              aria-busy={isPending ? true : undefined}
              className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <IconRefresh size={16} className="animate-spin" />
              ) : (
                <IconSpark size={16} />
              )}
              {isPending ? "Parsing CV…" : "Upload & Parse"}
            </button>
          </div>
        </form>

        <div className="bg-surface-container-low border border-outline-variant p-4 flex items-start gap-3">
          <IconShield size={18} className="text-primary mt-0.5 shrink-0" />
          <div>
            <div className="font-mono-label text-mono-label text-on-surface uppercase tracking-wider">
              Org-scoped storage
            </div>
            <div className="text-body-main text-outline mt-1">
              CVs are stored in a private Supabase bucket scoped to your
              organisation. RLS prevents cross-org reads, even by other
              authenticated users.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
