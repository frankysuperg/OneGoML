import type { OrderOffered } from '../types'

interface CurrentOrderCardProps {
  order: OrderOffered
}

function money(n: number): string {
  return `$${n.toFixed(0)}`
}

function km(n: number): string {
  return `${n.toFixed(1)} km`
}

function min(n: number): string {
  return `${n} min`
}

export function CurrentOrderCard({ order }: CurrentOrderCardProps) {
  const tip = order.est_tip_mxn ?? 0
  const payLine = [
    `${money(order.base_pay_mxn)} base`,
    tip > 0 ? `${money(tip)} tip` : null,
    `×${order.surge_multiplier.toFixed(1)} surge`,
  ]
    .filter(Boolean)
    .join(' · ')

  const pickupLabel = order.zone_pickup_name
    ? `z${order.zone_pickup} · ${order.zone_pickup_name}`
    : `zone ${order.zone_pickup}`
  const dropoffLabel = order.zone_dropoff_name
    ? `z${order.zone_dropoff} · ${order.zone_dropoff_name}`
    : `zone ${order.zone_dropoff}`

  const metaBits: string[] = []
  if (order.weight_kg !== undefined) metaBits.push(`${order.weight_kg} kg`)
  if (order.volume_liters !== undefined) {
    metaBits.push(`${order.volume_liters} L`)
  }
  if (order.restaurant_prep_min !== undefined) {
    metaBits.push(`${order.restaurant_prep_min} min prep`)
  }

  return (
    <article className="rounded-lg border border-neutral-200 bg-white px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-lg font-semibold tracking-tight text-neutral-950 tabular-nums">
          {payLine}
        </p>
        {order.platform ? (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            {order.platform}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm font-medium text-neutral-800 tabular-nums">
        Pickup {km(order.distance_pickup_km)} · Delivery{' '}
        {km(order.distance_delivery_km)}
      </p>

      {(order.estimated_pickup_min !== undefined ||
        order.estimated_delivery_min !== undefined) && (
        <p className="mt-1 text-sm text-neutral-700 tabular-nums">
          {order.estimated_pickup_min !== undefined
            ? `ETA pickup ${min(order.estimated_pickup_min)}`
            : null}
          {order.estimated_pickup_min !== undefined &&
          order.estimated_delivery_min !== undefined
            ? ' · '
            : null}
          {order.estimated_delivery_min !== undefined
            ? `ETA delivery ${min(order.estimated_delivery_min)}`
            : null}
        </p>
      )}

      <div className="mt-2 space-y-0.5 text-sm text-neutral-800">
        <p>
          <span className="text-neutral-500">Pickup</span> {pickupLabel}
        </p>
        <p>
          <span className="text-neutral-500">Dropoff</span> {dropoffLabel}
        </p>
      </div>

      {metaBits.length > 0 ? (
        <p className="mt-2 text-[11px] text-neutral-500 tabular-nums">
          {metaBits.join(' · ')}
        </p>
      ) : null}

      <p className="mt-1 text-[10px] text-neutral-400 tabular-nums">
        {order.order_id}
      </p>
    </article>
  )
}
