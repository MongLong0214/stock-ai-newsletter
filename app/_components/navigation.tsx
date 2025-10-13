import Link from "next/link";
import { Button } from "@/components/ui/button";

function Navigation() {
  return (
    <nav className="fixed top-0 w-full z-50 glass-morphism-strong" role="navigation" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="group relative text-xl font-medium tracking-tight text-green-400 hover:text-green-300 transition-all duration-300 ease-out-expo focus:outline-none rounded-lg px-3 py-2 -mx-3 -my-2"
            aria-label="Stock Matrix - Home"
          >
            <span className="relative z-10">Stock Matrix</span>
            <span className="absolute inset-0 rounded-lg bg-green-500/5 scale-0 group-hover:scale-100 transition-transform duration-300 ease-out-expo" aria-hidden="true" />
          </Link>
          <Link href="/subscribe">
            <Button
              variant="outline"
              className="relative group overflow-hidden bg-black/50 border-green-500/30 text-green-400 hover:text-black hover:border-green-400 transition-all duration-500 ease-out-expo focus:ring-green-500/50 px-6 py-2.5 rounded-full cursor-pointer"
              aria-label="Subscribe to newsletter"
            >
              <span className="relative z-10 font-medium tracking-wide">무료 메일받기</span>
              <span className="absolute inset-0 bg-green-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out-expo origin-left" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;