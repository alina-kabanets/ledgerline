import { ReviewPage } from "@/components/review/ReviewPage";

export default async function Page(props: PageProps<"/payments/[id]">) {
  const { id } = await props.params;
  const { from } = await props.searchParams;
  // Opened from the upload screen: Back returns there, to carry on with the batch.
  return <ReviewPage id={id} from={from === "upload" ? "upload" : "list"} />;
}
