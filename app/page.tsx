import { redirect } from "next/navigation";

// No marketing/home surface (README §scope). Signed-in users land on the
// dashboard; the Clerk proxy redirects signed-out traffic to /sign-in.
export default function Home() {
  redirect("/dashboard");
}
