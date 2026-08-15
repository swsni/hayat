export const isSafeCustomerId = (customerId: string): boolean => {
  return /^[a-zA-Z0-9_-]{3,128}$/.test(customerId);
};

export const isSafeCustomerReference = isSafeCustomerId;
