-- Self-serve teams: a company's own managers invite and remove colleagues and decide who can pay (buyers), who can decide on
-- bookings (publishers) and who can manage the team. Everyone already on Nashr keeps every permission.
alter table users add column can_pay boolean not null default true,
  add column can_decide boolean not null default true,
  add column can_manage boolean not null default false;
update users set can_manage = true where role in ('buyer', 'seller');
