import React, { useEffect, useState } from 'react';
import { PricingCards } from './pricing-cards.jsx';
import { loadPublicPlans } from './catalog-data.js';

export function PublicPricing() {
  const [state, setState] = useState({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    loadPublicPlans(controller.signal).then((plans) => { if (!controller.signal.aborted) setState({ plans }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [retry]);
  if (state.loading) return <p role="status" className="billing-policy">Memuat harga paket terbaru…</p>;
  if (state.error) return <div role="alert" className="billing-notice"><p>{state.error}</p><button type="button" onClick={() => setRetry((n) => n + 1)}>Coba lagi</button></div>;
  return state.plans.length ? <PricingCards plans={state.plans}/> : <p className="billing-policy">Paket belum dipublikasikan.</p>;
}
