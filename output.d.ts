type people = {
  id?: BigInt;
  first_name: string;
  last_name: string;
  is_child?: BigInt;
};

type items = { id?: BigInt; name: string; owner?: people };

type Tables = { people: people; items: items };
