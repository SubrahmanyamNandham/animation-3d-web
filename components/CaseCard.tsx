"use client";

import Image from "next/image";
import { assets } from "@/lib/assets";

export default function CaseCard() {
  return (
    <div className="group flex w-full cursor-pointer flex-row items-center gap-5 rounded-[20px] bg-white p-3 md:w-[330px] lg:w-[370px]">
      <div className="relative h-[120px] w-[120px] shrink-0 overflow-hidden rounded-[16px]">
        <Image
          src={assets.caseThumb}
          alt="Building Since 1990"
          fill
          className="object-cover transition-transform duration-250 ease-out group-hover:scale-[1.08]"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-250 ease-out group-hover:bg-black/20">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-6 w-6 opacity-0 transition-opacity duration-250 ease-out group-hover:opacity-100"
          >
            <path
              d="M7 17L17 7M17 7H9M17 7V15"
              stroke="#FFFFFF"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <span className="text-base font-medium text-black">
        Building Since 1990
      </span>
    </div>
  );
}
