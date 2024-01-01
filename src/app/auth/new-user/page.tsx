import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";

export default function Page() {
  return (
    <>
      <h1>Welcome to MediaNerdle!</h1>
      <p>Create a public player username</p>
      <form>
        <Label htmlFor="username">Username</Label>
        <Input type="text" id="username" />
        <Button>Submit</Button>
      </form>
    </>
  );
}
