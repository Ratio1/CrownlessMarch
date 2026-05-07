import { PointBuyForm } from '@/components/character/PointBuyForm';

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function CreateCharacterPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const allocationRequired = firstValue(searchParams?.allocation) === 'required';

  return (
    <main className="page page--create-character">
      <PointBuyForm allocationRequired={allocationRequired} />
    </main>
  );
}
