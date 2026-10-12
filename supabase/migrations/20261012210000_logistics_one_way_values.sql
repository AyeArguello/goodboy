-- One-way transport: the customer brings the dog and the groomer returns it
-- ('dropoff_only'), or the groomer picks it up and the customer collects it
-- ('pickup_only'). Priced at 50% of the full round trip. The new values are
-- only usable in the next migration (a new enum value cannot be used in the
-- transaction that adds it).
alter type logistics_mode add value if not exists 'pickup_only';
alter type logistics_mode add value if not exists 'dropoff_only';
