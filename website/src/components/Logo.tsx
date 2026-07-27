/**
 * @file src/components/Logo.tsx
 * @description The Kandown mark, inlined as JSX rather than loaded from
 * `public/logo.svg`.
 *
 * 📖 Why inline: the logo appears in the header of every page and in the hero.
 * As an `<img>` it costs a request and flashes on first paint; as JSX it ships
 * inside the already-critical HTML. The paths are a faithful copy of
 * `logo.svg` at the repo root. If that file changes, update this one too.
 *
 * @exports Logo. The rounded-square mark, sized by the `size` prop.
 * @exports Wordmark. Mark + "Kandown" lockup used in the header and footer.
 */

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 150 150"
      role="img"
      aria-label="Kandown"
      className={className}
    >
      <path
        d="M148,21.594L148,128.406C148,139.22 139.22,148 128.406,148L21.594,148C10.78,148 2,139.22 2,128.406L2,21.594C2,10.78 10.78,2 21.594,2L128.406,2C139.22,2 148,10.78 148,21.594Z"
        fill="url(#kandown-logo-bg)"
      />
      <g transform="matrix(0.823551,0,0,0.823551,12.830775,11.282318)">
        <g transform="matrix(1.620982,0,0,1.566239,-41.718998,-41.628205)">
          <path
            d="M56.491,62.601C57.2,61.897 57.602,60.925 57.606,59.908C57.627,53.936 57.7,33.2 57.7,33.2C57.6,29.7 55,27.6 52,27.6L42.075,27.6C38.544,27.6 35.673,30.547 35.644,34.201C35.528,48.996 35.327,83.484 35.956,83.013C35.956,83.013 52.072,66.994 56.491,62.601Z"
            fill="#fcffef"
          />
        </g>
        <g transform="matrix(1.566239,0,0,1.566239,-39.774573,-41.628205)">
          <path
            d="M87.6,43.8C84.2,43.9 80.5,45.1 77.7,47.5L39.2,86.2C37.1,88.3 35.8,91 35.7,93.7L35.7,116.574C35.7,117.219 36.088,117.802 36.683,118.051C37.278,118.3 37.965,118.167 38.425,117.714C50.467,105.842 98.836,58.16 110.608,46.555C111.047,46.122 111.185,45.468 110.956,44.894C110.728,44.321 110.178,43.94 109.561,43.928C106.663,43.871 103.089,43.8 103.089,43.8L87.6,43.8Z"
            fill="#f1ffb8"
          />
        </g>
        <g transform="matrix(0.766318,0.766329,-1.302872,1.302853,170.442469,-47.541879)">
          <path
            d="M38.038,101.45C35.808,101.45 34,100.387 34,99.075C34,95.326 34,88.102 34,84.58C34,84.042 34.364,83.525 35.011,83.145C35.658,82.764 36.536,82.55 37.452,82.55C46.372,82.55 69.5,82.55 69.5,82.55C69.5,82.55 69.5,77.52 69.5,74.389C69.5,73.947 69.936,73.545 70.617,73.359C71.298,73.173 72.101,73.236 72.675,73.521C80.028,77.17 98.075,86.125 104.279,89.204C104.832,89.479 105.168,89.876 105.206,90.301C105.245,90.727 104.982,91.143 104.481,91.45C98.972,94.832 83.072,104.591 75.013,109.539C74.195,110.041 72.946,110.206 71.841,109.959C70.737,109.712 69.99,109.101 69.946,108.406C69.744,105.262 69.5,101.45 69.5,101.45L38.038,101.45Z"
            fill="#88e138"
          />
        </g>
      </g>
      <defs>
        <linearGradient
          id="kandown-logo-bg"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(62,131,-131,62,9,8)"
        >
          <stop offset="0" stopColor="#0c1d17" />
          <stop offset="1" stopColor="#182923" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 150 150"
      role="img"
      aria-label="Kandown mark"
      className={className}
      style={{ fillRule: 'evenodd', clipRule: 'evenodd', strokeLinejoin: 'round', strokeMiterlimit: 2 }}
    >
      <g transform="matrix(0.823551,0,0,0.823551,12.830775,11.282318)">
        <g transform="matrix(1.620982,0,0,1.566239,-41.718998,-41.628205)">
          <path
            d="M56.491,62.601C57.2,61.897 57.602,60.925 57.606,59.908C57.627,53.936 57.7,33.2 57.7,33.2C57.6,29.7 55,27.6 52,27.6L42.075,27.6C38.544,27.6 35.673,30.547 35.644,34.201C35.528,48.996 35.327,83.484 35.956,83.013C35.956,83.013 52.072,66.994 56.491,62.601Z"
            style={{ fill: 'rgb(252,255,239)', fillRule: 'nonzero' }}
          />
        </g>
        <g transform="matrix(1.566239,0,0,1.566239,-39.774573,-41.628205)">
          <path
            d="M87.6,43.8C84.2,43.9 80.5,45.1 77.7,47.5L39.2,86.2C37.1,88.3 35.8,91 35.7,93.7L35.7,116.574C35.7,117.219 36.088,117.802 36.683,118.051C37.278,118.3 37.965,118.167 38.425,117.714C50.467,105.842 98.836,58.16 110.608,46.555C111.047,46.122 111.185,45.468 110.956,44.894C110.728,44.321 110.178,43.94 109.561,43.928C106.663,43.871 103.089,43.8 103.089,43.8L87.6,43.8Z"
            style={{ fill: 'rgb(241,255,184)', fillRule: 'nonzero' }}
          />
        </g>
        <g transform="matrix(0.766318,0.766329,-1.302872,1.302853,170.442469,-47.541879)">
          <path
            d="M38.038,101.45C35.808,101.45 34,100.387 34,99.075L34,84.58C34,84.042 34.364,83.525 35.011,83.145C35.658,82.764 36.536,82.55 37.452,82.55L69.5,82.55L69.5,74.389C69.5,73.947 69.936,73.545 70.617,73.359C71.298,73.173 72.101,73.236 72.675,73.521C80.028,77.17 98.075,86.125 104.279,89.204C104.832,89.479 105.168,89.876 105.206,90.301C105.245,90.727 104.982,91.143 104.481,91.45C98.972,94.832 83.072,104.591 75.013,109.539C74.195,110.041 72.946,110.206 71.841,109.959C70.737,109.712 69.99,109.101 69.946,108.406C69.744,105.262 69.5,101.45 69.5,101.45L38.038,101.45Z"
            style={{ fill: 'rgb(136,225,56)' }}
          />
        </g>
      </g>
    </svg>
  )
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      {/* 📖 A 4px radius, not a pill: the mark should sit in the same geometry
          as the rest of the site, which is built from square rules. */}
      <Logo size={size} className="rounded-[4px]" />
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">kandown</span>
    </span>
  )
}
