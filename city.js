const regionLinks = { pcie: 'regions/pcie/index.html' };
const activeRegion = document.querySelector('.overview-district.active');
const activeCard = document.querySelector('.region-card.region-active');

function focusRegion(region) {
  document.querySelectorAll('[data-region], [data-region-card]').forEach((element) => {
    const matches = element.dataset.region === region || element.dataset.regionCard === region;
    element.classList.toggle('focused', matches);
  });
  const card = document.querySelector(`[data-region-card="${region}"]`);
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.querySelectorAll('.overview-district').forEach((district) => {
  const region = district.dataset.region;
  district.addEventListener('click', () => {
    if (regionLinks[region]) window.location.href = regionLinks[region];
    else focusRegion(region);
  });
  district.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (regionLinks[region]) window.location.href = regionLinks[region];
      else focusRegion(region);
    }
  });
});

document.querySelectorAll('.region-card').forEach((card) => {
  card.addEventListener('mouseenter', () => focusRegion(card.dataset.regionCard));
  card.addEventListener('mouseleave', () => document.querySelectorAll('.focused').forEach((item) => item.classList.remove('focused')));
});

if (activeRegion && activeCard) {
  activeRegion.classList.add('focused');
  activeCard.classList.add('focused');
}
