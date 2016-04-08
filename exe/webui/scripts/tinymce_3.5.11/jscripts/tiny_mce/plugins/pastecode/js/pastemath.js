var PasteMathDialog = {
	isMathBlock : false,
	init : function() {
		
		if (!parent) {
			alert(tinyMCEPopup.getLang("pastecode.inline_popups_plugin_is_required"));
			return false;
		}
		if (typeof(parent.jQuery)!='function') {
			alert(tinyMCEPopup.getLang("pastecode.jquery_is_required"));
			return false;
		}		
        
        var codeOptionsSpan = document.getElementById("codeOptions");
		codeOptionsSpan.innerHTML = codeOptionsSpan.innerHTML.replace("mathjax.org","<a href='https://www.mathjax.org/' target='_blank'>mathjax.org</a>");        
		
		var pasteInstructionsSpan = document.getElementById("pasteInstructions");
		pasteInstructionsSpan.innerHTML = pasteInstructionsSpan.innerHTML.replace("eXeMathEditor","<a href='#' onclick='PasteMathDialog.mathEditor.start();return false'>fMath</a>").replace("(LaTeX...)","(LaTeX, MathML)");
		
		var helpPanel = document.getElementById("help_panel");
		helpPanel.innerHTML = helpPanel.innerHTML.replace("(LaTeX...)","(LaTeX, MathML)").replace("eXeMathEditor","<a href='http://fmath.info/' target='_blank'>fMath</a>").replace("MathJax","<a href='https://www.mathjax.org/' target='_blank'>MathJax</a>");
        
        mcTabs.displayTab('general_tab','general_panel');        
		
		var f = document.forms[0];
		
		// Check if it's math code
		
		var ed = tinyMCEPopup.editor; 
		var n = ed.selection.getNode();
		var dom = ed.dom; 
		var x = f.elements;	
		
		if (n.nodeName == 'IMG') { 
			
			var step1 = n.parentNode;
			
			if (step1 && step1.nodeName=="P" && dom.getAttrib(step1, 'class').indexOf("exe-math-img")!=-1) {
				
				// Code and image (recommended)
				
				var step2 = step1.parentNode;
				if (step2 && step2.nodeName=="DIV" && step2.className.indexOf("exe-math ")!=-1) {
					
					// "Globals"
					this.isMathBlock = true;
					this.mathBlock = step2;
					
					// Get the original image HTML
					var imageSrc = dom.getAttrib(n, 'src');
					var imageWidth = dom.getAttrib(n, 'width');
					var imageHeight = dom.getAttrib(n, 'height');
					this.originalImage = "<img alt='$PasteMathDialogAlt' src='"+imageSrc+"' width='"+imageWidth+"' height='"+imageHeight+"' />";
					
					// Alt and src
					x.src.value = imageSrc;
					x.imgAlt.value = dom.getAttrib(n, 'alt');
					
					// Get the original code
					var htmlSource = parent.jQuery(".exe-math-code",step2).html();
					this.htmlSource = htmlSource;
					f.htmlSource.value = htmlSource;
					
					// Type
					var showImage = step2.className.indexOf("show-image")!=-1;
					if (showImage) {
						this.setSelectedOption("use","image");
						PasteMathDialog.toggleCodeOptions();
					}
					// MathJax
					if (!showImage && step2.className.indexOf("exe-math-engine")==-1) x.mathjax.checked = false;
				}
			} else {
				
				// Check if the image was created using the old plugin (exemath)
				
				var img = parent.jQuery(n);
				var exe_math_latex = img.attr("exe_math_latex");
				
				if (exe_math_latex && exe_math_latex!="") {
					tinyMCEPopup.confirm(tinyMCEPopup.getLang('pastecode.update_exemath_image_1')+"\n"+tinyMCEPopup.getLang('pastecode.update_exemath_image_2'), function(s) {
						if (s) {
							parent.jQuery.ajax({
								type: "GET",
								url: exe_math_latex,
								success: function(res){
									
									// We've got the code, so we set the right values
									
									// "Globals"
									this.isMathBlock = true;
									this.mathBlock = n;
									
									// Get the original image HTML
									var imageSrc = dom.getAttrib(n, 'src');
									var imageWidth = dom.getAttrib(n, 'width');
									var imageHeight = dom.getAttrib(n, 'height');
									this.originalImage = "<img alt='$PasteMathDialogAlt' src='"+imageSrc+"' width='"+imageWidth+"' height='"+imageHeight+"' />";
									
									// Alt and src
									x.src.value = imageSrc;
									x.imgAlt.value = dom.getAttrib(n, 'alt');
									
									// Get the original code
									this.htmlSource = res;
									f.htmlSource.value = res;
									
									// Type
									PasteMathDialog.setSelectedOption("use","image");
									PasteMathDialog.toggleCodeOptions();

									tinyMCEPopup.alert(tinyMCEPopup.getLang('pastecode.update_exemath_image_3'));
									
								},
								error: function(){
									tinyMCEPopup.alert(tinyMCEPopup.getLang('pastecode.no_source_code_found'),function(){
										tinyMCEPopup.close();
									});
								}
							});
						}
					});
				}
				
			}
			
		} else if (n.nodeName == 'DIV') {
			
			var c = n.className;
			
			if (c.indexOf("exe-math")!=-1 && c.indexOf("code-only")!=-1) {
				
				// Code without image				
				
				// "Globals"
				this.isMathBlock = true;
				this.mathBlock = n;				
				
				// Get the original code
				var htmlSource = parent.jQuery(".exe-math-code",n).html();
				this.htmlSource = htmlSource;
				f.htmlSource.value = htmlSource;
				
				// MathJax
				if (!showImage && n.className.indexOf("exe-math-engine")==-1) x.mathjax.checked = false;
				
				// Hide the alternative text field
				x.includeImage.checked = false;
				this.toggleImageAlt();
				
			}
			
		} else {
			// Get the selected contents as text and place it in the input
			f.htmlSource.value = tinyMCEPopup.editor.selection.getContent({format : 'text'});
		}
	},
	mathEditor : {
		isWarned : false,
		start : function(){
			PasteMathDialog.mathEditor.field = document.getElementById("htmlSource");
			if (PasteMathDialog.mathEditor.isWarned==false) {
				var extra = tinyMCEPopup.getLang('pastecode.equation_editor_warning')+'\n\n';
				if (PasteMathDialog.mathEditor.field.value=="") extra = "";
				tinyMCEPopup.confirm(extra+tinyMCEPopup.getLang('pastecode.equation_editor_instructions'), function(s) {
					if (s) {
						PasteMathDialog.mathEditor.isWarned = true;
						PasteMathDialog.mathEditor.start();
					}
				});
				return false;
			}
			var mypage = "/tools/fMath/";
			var myname = tinyMCEPopup.getLang("pastecode.equation_editor");
			var w = 983;
			var features = "titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=no";
			var h = 418;
			var win = null;
			var winl = (screen.width-w)/2;
			var wint = (screen.height-h)/2;
			if (winl < 0) winl = 0;
			if (wint < 0) wint = 0;
			var settings = 'height=' + h + ',';
			settings += 'width=' + w + ',';
			settings += 'top=' + wint + ',';
			settings += 'left=' + winl + ',';
			settings += features;
			win = window.open(mypage,myname,settings);
			win.window.focus();
		}
	},
	setSelectedOption : function(n,v){
		var radios = document.getElementsByName(n);
		for (var i = 0, length = radios.length; i < length; i++) {
			if (radios[i].value==v) {
				radios[i].checked = "checked";
				break;
			}
		}		
	},	
	getSelectedOption : function(n){
		var radios = document.getElementsByName(n);
		for (var i = 0, length = radios.length; i < length; i++) {
			if (radios[i].checked) {
				return radios[i].value;
				break;
			}
		}	
	},	
	createMathImage : function(field_name, math_code, font_size) {
		
		// Update the image only if the code has changed:
		
		if (this.isMathBlock && this.htmlSource==math_code && typeof(this.originalImage)!='undefined') {
			// Insert the new code
			PasteMathDialog.insertMathAndImage(src,"",document.getElementById('imgAlt').value); // The image has not changed (img == "")
			return false;
		}
		
		var win = window;
	
		var w = "";
		if (typeof(top.nevow_clientToServerEvent)!='undefined') {
			w = top;
		} else {
			alert(tinyMCEPopup.getLang("pastecode.inline_popups_plugin_is_required"));
			PasteMathDialog.preloader.hide();
			return;
		}

		var local_imagePath = ""

		if (math_code == "") {
			PasteMathDialog.preloader.hide();
			return;
		}

		if (typeof(w.curr_edits_math_num)=='undefined') w.curr_edits_math_num = 0;			

		// to help unique-ify each previewed math image:
		var preview_basename = "eXe_LaTeX_math_"+w.curr_edits_math_num
		var preview_math_imagefile = preview_basename+".gif"
		// Simplify the subsequent file-lookup process,  by just appending 
		// the ".tex" to the full image name, as such:
		var preview_math_srcfile = preview_math_imagefile+".tex"

		w.curr_edits_math_num += 1

		// netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
		// pass the file information on to the server,
		// to generate the image into the server's "previews" directory:

		var method = 'generateTinyMCEmath';
		if (math_code.indexOf("<math")!=-1) method = 'generateTinyMCEmathML';
        
		try {
			
			w.nevow_clientToServerEvent(
				method, 
				this, 
				'', 
				win, 
				win.name, 
				field_name, 
				math_code, 
				4, 
				preview_math_imagefile, 
				preview_math_srcfile
			);	

			// once the image has been generated, it SHOULD be sitting here:
			var full_preview_url = "/previews/"+preview_math_imagefile;

			win.focus();

			// clear out any old value in the tinyMCE image filename field:
			win.document.forms[0].elements[field_name].value = ""; 
			// PreviewImage is only available for images:
			this.updateImage(" ");
			// the above two commands are the only way to really 
			// ensure that we can trigger the onchange event below:

			// set the tinyMCE image filename field:
			win.document.forms[0].elements[field_name].value = full_preview_url;
			// then force its onchange event:
			// PreviewImage is only available for images:
			this.updateImage(full_preview_url);
		
		} catch(e) {
			
            tinyMCEPopup.confirm(tinyMCEPopup.getLang('pastecode.insert_code_without_image'), function(s) {
                if (s) {
                    // Insert code without image
                    PasteMathDialog.insertMath(math_code);
                } else {
                    PasteMathDialog.preloader.hide();
                }
            });				
			
		}

	},	
	getMathBlockClass : function(withImage){
		var type = this.getSelectedOption("use");
		var k = "exe-math show-"+type;
		if (withImage==false) k = "exe-math code-only";
		if (type == "code" && document.getElementById("mathjax").checked) {
			k += " exe-math-engine";
		}
        var position = "position-center";
        if (this.isMathBlock) {
            // Respect the alignment
            var klass = parent.jQuery(this.mathBlock).attr("class");
            if (klass.indexOf(" position-left")!=-1) position = "position-left";
            else if (klass.indexOf(" position-right")!=-1) position = "position-right";
            else if (klass.indexOf(" float-left")!=-1) position = "float-left";
            else if (klass.indexOf(" float-right")!=-1) position = "float-right";
        }
        k += " "+position;
		return k;
	},
	insertMath : function(code) {
		if (this.isMathBlock) {
			parent.jQuery(this.mathBlock).remove();
		}
		var content = "<div class='"+this.getMathBlockClass(false)+"'>";
			content += "<p class='exe-math-code'>"+this.mathCode+"</p>";
		content += "</div>";		
		if (!this.isMathBlock) content += "<br />";		
		tinyMCEPopup.editor.execCommand('mceInsertContent', false, content);
		tinyMCEPopup.close();
	},
	insertMathAndImage : function(src,img,alt){
		alt = alt.replace(/"/g, "&quot;");
		var content = "<div class='"+this.getMathBlockClass()+"'>";
		if (this.isMathBlock) {
			parent.jQuery(this.mathBlock).remove();
			// The image existed and it has not changed
			if (img=="" && typeof(this.originalImage)!="undefined") content += "<p class='exe-math-img'>"+this.originalImage.replace("$PasteMathDialogAlt",alt)+"</p>";
			// The imagen has changed
			else content += "<p class='exe-math-img'><img alt='"+alt+"' src='"+src+"' width='"+img.width+"' height='"+img.height+"' /></p>";
		} else {
			content += "<p class='exe-math-img'><img alt='"+alt+"' src='"+src+"' width='"+img.width+"' height='"+img.height+"' /></p>";
		}
		content += "<p class='exe-math-code'>"+this.mathCode+"</p>";
		content += "</div>";		
		if (!this.isMathBlock) content += "<br />";		
		tinyMCEPopup.editor.execCommand('mceInsertContent', false, content);
		tinyMCEPopup.close();		
	},
	updateImageData : function(e){
		var src = e.src;
		if (src.indexOf("/")!=0) {
			// Remove domain, etc.
			var loc = window.location;
			src = src.replace("http://","");
			src = src.replace("https://","");
			src = src.replace(loc.hostname+":"+loc.port,"");
			src = src.replace(loc.hostname,"");
		}
		var img = document.getElementById('previewImg');		
		if (img) {	
			// Insert the new code
			PasteMathDialog.insertMathAndImage(src,img,document.getElementById('imgAlt').value);
		}	
	},	
	updateImage : function(src) {
		var elm = document.getElementById('prev');
		if (src!="") {
			elm.innerHTML = '<img id="previewImg" src="' + src + '" onload="PasteMathDialog.updateImageData(this);" />'
		} else {
			elm.innerHTML = "";
		}
	},	
	toggleImageAlt : function(e){
		var display = "none";
		if (!e) var e = document.getElementById("includeImage");
		var h = 155;
		if (e.checked) {
			display = "block";
			h = 122;
		}
		document.getElementById("imageOptions").style.display = display;
		if (document.getElementById("codeOptions").style.display!="none") {
			document.getElementById("htmlSource").style.height = h+"px";
		}
	},
	toggleCodeOptions : function(){
		var type = this.getSelectedOption("use");
		var h = 122;
		if (!document.getElementById("includeImage").checked) h = 155;
		var display = "block";
		if (type=="image") {
			display = "none";
			h = 182;
			document.getElementById("imageOptions").style.display = "block";
		} else {
			this.toggleImageAlt();
		}
		document.getElementById("codeOptions").style.display = display;
		document.getElementById("htmlSource").style.height = h+"px";
	},
	preloader : {
		show : function(){
			document.getElementsByTagName("html")[0].className = "working";
		},
		hide : function(){
			document.getElementsByTagName("html")[0].className = "";
		}
	},
	insert : function() {
		var f = document.forms[0];
		var content = f.htmlSource.value;
		if (content!="") {
            
			this.mathCode = content;
			var type = this.getSelectedOption("use");
			this.preloader.show();
			
			if (type=="code" && !document.getElementById("includeImage").checked) {
				
				// Insert code without image
				this.insertMath(content);
				return false;
				
			} else {
				
				// Create the image, but ask for confirmation if it has no alternative text
				var alt = document.getElementById('imgAlt').value;
				if (alt=="") {
					tinyMCEPopup.confirm(tinyMCEPopup.getLang('pastecode.missing_alt'), function(s) {
						if (s) {
							PasteMathDialog.createMathImage("src",content);
						} else {
							PasteMathDialog.preloader.hide();
						}
					});
					return false;
				} else {
					PasteMathDialog.createMathImage("src",content);
				}		
				
			}
        }		
		return false;
	}
};
tinyMCEPopup.onInit.add(PasteMathDialog.init, PasteMathDialog);