"use client";

import Image from "next/image";
import { useState } from "react";
import { BookOpen, ClipboardList, Gift, Timer } from "lucide-react";

const illustrations = {
  practice: { src: "/ui/academy/practice.webp", icon: BookOpen },
  exam: { src: "/ui/academy/exam.webp", icon: Timer },
  assignment: { src: "/ui/academy/assignment.webp", icon: ClipboardList },
  reward: { src: "/ui/academy/reward.webp", icon: Gift },
};

export type AcademyIllustrationKind = keyof typeof illustrations;

export function AcademyIllustration({
  kind,
  className = "",
  eager = false,
}: {
  kind: AcademyIllustrationKind;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const { src, icon: Icon } = illustrations[kind];

  return (
    <span aria-hidden="true" className={`academy-illustration ${className}`}>
      {failed ? (
        <Icon className="academy-illustration-fallback" size={42} strokeWidth={1.5} />
      ) : (
        <Image
          alt=""
          draggable={false}
          height={384}
          loading={eager ? "eager" : "lazy"}
          onError={() => setFailed(true)}
          src={src}
          unoptimized
          width={384}
        />
      )}
    </span>
  );
}
