import React from "react";

export default function Download({ size = "1em", text }) {
  return (
    <svg
      stroke="currentColor"
      fill="currentColor"
      height={size}
      width={size}
      viewBox={`0 0 100 ${text ? "150": "100"}`}
    >
      <path d="m52.058 70.407v0.438l-0.308-0.308c-0.559 0.216-1.172 0.343-1.79 0.343-0.681 0-1.295-0.127-1.875-0.371l-0.064 0.063v-0.09c-0.397-0.174-0.778-0.404-1.153-0.685l-0.2-0.15s-14.644-14.724-14.637-14.718c-1.819-1.819-1.976-4.676-0.157-6.755l0.076-0.086 0.081-0.081c1.819-1.819 4.676-1.976 6.755-0.157l0.086 0.076 6.303 6.303v-43.162c0-2.702 2.162-4.864 4.865-4.864 2.702-0 4.864 2.162 4.864 4.864v43.119l6.239-6.117c1.917-1.899 4.916-1.893 6.826 0.017 1.916 1.916 1.916 4.927 0 6.843l-14.547 14.548c-0.365 0.365-0.835 0.687-1.364 0.93zm16.916-41.172c-2.042-1.596-2.403-4.55-0.807-6.592s4.55-2.403 6.592-0.807c9.424 7.367 15.484 18.841 15.484 31.719-0 22.21-18.032 40.242-40.243 40.242s-40.243-18.032-40.243-40.242c0-12.878 6.06-24.352 15.484-31.719 2.042-1.596 4.996-1.235 6.592 0.807s1.235 4.996-0.807 6.592c-7.226 5.649-11.877 14.445-11.877 24.32 0 17.027 13.824 30.851 30.851 30.851s30.851-13.824 30.851-30.851c-0-9.875-4.651-18.671-11.877-24.32z" />
      {text && <text x="0" y="150" fontSize="40" fontWeight="bold" textLength="100">
        {text}
      </text>}
    </svg>
  );
};