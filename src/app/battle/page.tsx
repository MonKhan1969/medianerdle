import { Input } from "@/app/_components/ui/input";
import { Button } from "@/app/_components/ui/button";

export default async function Battle() {
  return (
    <main className="mx-auto w-11/12 max-w-xl flex-col space-y-8 p-8">
      <div className="flex justify-between">
        <div>User</div>
        <div>vs</div>
        <div>Opponent</div>
      </div>
      <div className="mx-auto flex w-full max-w-sm">
        <Input type="text" placeholder="Movie or TV Show" />
        <Button type="submit">Submit</Button>
      </div>
      <div className="flex-col">
        <MovieWithLinks />
        <MovieWithLinks />
        <MovieWithLinks />
        <Movie />
      </div>
    </main>
  );
}

function MovieWithLinks() {
  return (
    <div className="flex-col">
      <Movie />
      <div className="mx-auto h-12 w-1 bg-green-500" />
      <PeopleLinks people={people} />
      <div className="mx-auto h-12 w-1 bg-green-500" />
    </div>
  );
}

function Movie() {
  return (
    <div className="w-full rounded-lg bg-red-500 p-5 text-center">
      Media Title Here
    </div>
  );
}

// TODO: rethink implementation

type PeopleLinksProps = {
  people: Array<{ id: number; name: string }>;
};

function PeopleLinks({ people }: PeopleLinksProps) {
  return (
    <div className="mx-auto w-3/4 max-w-xs flex-col rounded-lg bg-blue-500 text-center">
      {people.map((p) => (
        <div key={p.id} className="flex justify-around text-pretty p-1">
          <div>{p.name}</div>
          <div>Stars</div>
        </div>
      ))}
    </div>
  );
}

const people = [
  { id: 1, name: "Person 1" },
  { id: 2, name: "Person 2" },
  { id: 3, name: "Person 3" },
];
