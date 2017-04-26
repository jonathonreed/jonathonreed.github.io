var slideIndex = 1;
showSlides(slideIndex);

function plusSlides(n) {
  showSlides(slideIndex += n);
}

function currentSlide(n) {
  showSlides(slideIndex = n);
}

function showSlides(n) {
  var i;
  var slides = document.getElementsByClassName("mySlides");
  var cSlides = document.getElementsByClassName("creativeSlides");
  var dots = document.getElementsByClassName("dot");
  if (n > slides.length) {slideIndex = 1} 
  if (n > cSlides.length) {slideIndex = 1}
  if (n < 1) {slideIndex = slides.length}
  if (n < 1) {slideIndex = cSlides.length}
  for (i = 0; i < slides.length; i++) {
      slides[i].style.display = "none";
  }
  for (i = 0; i < cSlides.length; i++) {
	  cSlides[i].style.display = "none";
  }
  for (i = 0; i < dots.length; i++) {
      dots[i].className = dots[i].className.replace(" active", "");
  }
  slides[slideIndex-1].style.display = "block"; 
  cSlides[slideIndex-1].style.display = "block";
  dots[slideIndex-1].className += " active";
}