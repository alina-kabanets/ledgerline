import { ReviewPage } from "@/components/review/ReviewPage";

export default async function Page(props: PageProps<"/payments/[id]">) {
  const { id } = await props.params;
  return <ReviewPage id={id} />;
}
